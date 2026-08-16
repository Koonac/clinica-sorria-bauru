<?php

namespace App\Services\Crm;

use App\Models\Crm\WhatsappMessage;
use App\Models\SystemSetting;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Storage;

/**
 * Remove arquivos de mídia antigos ou que estouram o teto por clínica.
 * A mensagem no banco (texto, transcrição, descrição) permanece.
 */
class PruneWhatsappMedia
{
    public function __construct(private WhatsappMediaStore $mediaStore) {}

    /**
     * @return array{expired: int, capped: int, orphans: int, retention_days: int, max_bytes: int}
     */
    public function handle(bool $dryRun = false): array
    {
        $retentionDays = $this->retentionDays();
        $maxBytes = $this->maxBytesPerClinic();

        $expired = $this->pruneExpired($retentionDays, $dryRun);
        $capped = $this->enforceCaps($maxBytes, $dryRun);
        $orphans = $this->pruneOrphans($dryRun);

        return [
            'expired' => $expired,
            'capped' => $capped,
            'orphans' => $orphans,
            'retention_days' => $retentionDays,
            'max_bytes' => $maxBytes,
        ];
    }

    public function retentionDays(): int
    {
        return max(1, min(3650, (int) SystemSetting::resolve(SystemSetting::KEY_WHATSAPP_MEDIA_RETENTION_DAYS)));
    }

    public function maxBytesPerClinic(): int
    {
        $megabytes = max(1, min(102400, (int) SystemSetting::resolve(SystemSetting::KEY_WHATSAPP_MEDIA_MAX_MB_PER_CLINIC)));

        return $megabytes * 1024 * 1024;
    }

    private function pruneExpired(int $retentionDays, bool $dryRun): int
    {
        $cutoff = now()->subDays($retentionDays);
        $count = 0;

        foreach ($this->storedMediaQuery()->where('created_at', '<=', $cutoff)->orderBy('id')->cursor() as $message) {
            if ($this->mediaStore->storedPath($message) === null) {
                continue;
            }
            if (! $dryRun) {
                $this->mediaStore->purge($message);
            }
            $count++;
        }

        return $count;
    }

    private function enforceCaps(int $maxBytes, bool $dryRun): int
    {
        $clinicIds = $this->storedMediaQuery()
            ->select('clinic_id')
            ->distinct()
            ->pluck('clinic_id');

        $count = 0;
        foreach ($clinicIds as $clinicId) {
            $count += $this->enforceCap((int) $clinicId, $maxBytes, $dryRun);
        }

        return $count;
    }

    private function enforceCap(int $clinicId, int $maxBytes, bool $dryRun): int
    {
        $messages = $this->storedMediaQuery()
            ->where('clinic_id', $clinicId)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->filter(fn (WhatsappMessage $message) => $this->mediaStore->storedPath($message) !== null)
            ->values();

        $total = 0;
        foreach ($messages as $message) {
            $total += $this->mediaStore->storedBytes($message);
        }

        if ($total <= $maxBytes) {
            return 0;
        }

        $count = 0;
        foreach ($messages as $message) {
            if ($total <= $maxBytes) {
                break;
            }
            $bytes = $this->mediaStore->storedBytes($message);
            if (! $dryRun) {
                $this->mediaStore->purge($message);
            }
            $total = max(0, $total - $bytes);
            $count++;
        }

        return $count;
    }

    private function pruneOrphans(bool $dryRun): int
    {
        $files = Storage::disk('local')->allFiles(WhatsappMediaStore::DIRECTORY);
        $count = 0;

        foreach ($files as $file) {
            if ($this->isReferenced($file)) {
                continue;
            }
            if (! $dryRun) {
                Storage::disk('local')->delete($file);
            }
            $count++;
        }

        return $count;
    }

    private function isReferenced(string $file): bool
    {
        $id = (int) pathinfo($file, PATHINFO_FILENAME);
        if ($id < 1) {
            return false;
        }

        $message = WhatsappMessage::withoutGlobalScopes()->find($id);

        return $message !== null && $this->mediaStore->storedPath($message) === $file;
    }

    /**
     * @return Builder<WhatsappMessage>
     */
    private function storedMediaQuery()
    {
        return WhatsappMessage::withoutGlobalScopes()
            ->where('has_media', true)
            ->whereNotNull('media');
    }
}
