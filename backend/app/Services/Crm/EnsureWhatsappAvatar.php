<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\Contact;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class EnsureWhatsappAvatar
{
    public const STATUS_OK = 'ok';

    public const STATUS_MISSING = 'missing';

    public const STATUS_FAILED = 'failed';

    private const FRESH_DAYS = 7;

    private const NEGATIVE_HOURS = 24;

    public function needsFetch(Contact $contact): bool
    {
        $fetchedAt = $contact->avatar_fetched_at;
        $status = $contact->avatar_status;

        if ($status === self::STATUS_OK && $fetchedAt && $fetchedAt->gt(now()->subDays(self::FRESH_DAYS))) {
            $path = $contact->avatar_path;
            if (is_string($path) && $path !== '' && Storage::disk('local')->exists($path)) {
                return false;
            }
        }

        if (
            in_array($status, [self::STATUS_MISSING, self::STATUS_FAILED], true)
            && $fetchedAt
            && $fetchedAt->gt(now()->subHours(self::NEGATIVE_HOURS))
        ) {
            return false;
        }

        return true;
    }

    public function hasServableAvatar(Contact $contact): bool
    {
        if ($contact->avatar_status !== self::STATUS_OK) {
            return false;
        }

        $path = $contact->avatar_path;
        if (! is_string($path) || $path === '') {
            return false;
        }

        return Storage::disk('local')->exists($path);
    }

    /**
     * @return bool true se há avatar servível após a execução
     */
    public function handle(Connection $connection, Contact $contact, bool $force = false): bool
    {
        if (! $force && ! $this->needsFetch($contact)) {
            return $this->hasServableAvatar($contact);
        }

        $jid = trim((string) ($contact->whatsapp_jid ?? ''));
        if ($jid === '') {
            $this->mark($contact, self::STATUS_MISSING, null);

            return false;
        }

        if ($connection->status !== 'connected' || ! filled($connection->session_id)) {
            return $this->hasServableAvatar($contact);
        }

        $lock = Cache::lock('wa-avatar:'.$connection->id.':'.$jid, 30);
        if (! $lock->get()) {
            return $this->hasServableAvatar($contact->fresh() ?? $contact);
        }

        try {
            $contact->refresh();
            if (! $force && ! $this->needsFetch($contact)) {
                return $this->hasServableAvatar($contact);
            }

            try {
                $result = (new WhatsappApiClient($connection))->getProfilePicUrl(
                    (string) $connection->session_id,
                    $jid,
                );
            } catch (RuntimeException $e) {
                Log::warning('EnsureWhatsappAvatar: API falhou', [
                    'contact_id' => $contact->id,
                    'message' => $e->getMessage(),
                ]);
                $this->mark($contact, self::STATUS_FAILED, $contact->avatar_path);

                return false;
            }

            $url = is_string($result['url'] ?? null) ? trim((string) $result['url']) : '';
            if ($url === '') {
                $this->deleteStored($contact);
                $this->mark($contact, self::STATUS_MISSING, null);

                return false;
            }

            $binary = Http::timeout(20)->get($url);
            if (! $binary->successful() || $binary->body() === '') {
                $this->mark($contact, self::STATUS_FAILED, $contact->avatar_path);

                return false;
            }

            $mime = strtolower((string) ($binary->header('Content-Type') ?: 'image/jpeg'));
            $ext = str_contains($mime, 'png') ? 'png' : (str_contains($mime, 'webp') ? 'webp' : 'jpg');
            $clinicId = (int) ($contact->clinic_id ?: $connection->clinic_id);
            $path = sprintf(
                'whatsapp-avatars/%d/%s.%s',
                $clinicId,
                hash('sha256', $connection->id.'|'.$jid),
                $ext,
            );

            Storage::disk('local')->put($path, $binary->body());
            if ($contact->avatar_path && $contact->avatar_path !== $path) {
                Storage::disk('local')->delete($contact->avatar_path);
            }

            $this->mark($contact, self::STATUS_OK, $path);

            return true;
        } catch (Throwable $e) {
            Log::warning('EnsureWhatsappAvatar: exceção', [
                'contact_id' => $contact->id,
                'message' => $e->getMessage(),
            ]);
            $this->mark($contact, self::STATUS_FAILED, $contact->avatar_path);

            return false;
        } finally {
            $lock->release();
        }
    }

    private function mark(Contact $contact, string $status, ?string $path): void
    {
        $contact->forceFill([
            'avatar_status' => $status,
            'avatar_path' => $path,
            'avatar_fetched_at' => now(),
        ])->save();
    }

    private function deleteStored(Contact $contact): void
    {
        if (is_string($contact->avatar_path) && $contact->avatar_path !== '') {
            Storage::disk('local')->delete($contact->avatar_path);
        }
    }
}
