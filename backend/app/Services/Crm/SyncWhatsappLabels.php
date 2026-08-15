<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\PipelineStage;
use Illuminate\Support\Facades\Log;
use Throwable;

class SyncWhatsappLabels
{
    public function labelName(PipelineStage $stage): string
    {
        $prefix = $stage->kind === 'deal' ? 'Deal' : 'Lead';

        return "{$prefix}: {$stage->name}";
    }

    public function ensurePipelineLabels(Connection $connection): void
    {
        if (! $this->canSync($connection)) {
            return;
        }

        try {
            $client = new WhatsappApiClient($connection);
            $sessionId = (string) $connection->session_id;
            $existing = $this->indexLabelsByName($client->listLabels($sessionId));

            $stages = PipelineStage::query()
                ->where('active', true)
                ->orderBy('kind')
                ->orderBy('position')
                ->get();

            foreach ($stages as $stage) {
                $name = $this->labelName($stage);
                if (isset($existing[$name])) {
                    continue;
                }

                $created = $client->createLabel($sessionId, $name);
                $label = $created['label'] ?? null;
                if (is_array($label) && isset($label['name'], $label['id'])) {
                    $existing[(string) $label['name']] = (string) $label['id'];
                }
            }
        } catch (Throwable $e) {
            Log::warning('Falha ao garantir labels do pipeline no WhatsApp.', [
                'connection_id' => $connection->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function ensureStageLabel(Connection $connection, PipelineStage $stage): ?string
    {
        if (! $this->canSync($connection)) {
            return null;
        }

        try {
            $client = new WhatsappApiClient($connection);
            $sessionId = (string) $connection->session_id;
            $name = $this->labelName($stage);
            $existing = $this->indexLabelsByName($client->listLabels($sessionId));

            if (isset($existing[$name])) {
                return $existing[$name];
            }

            $created = $client->createLabel($sessionId, $name);
            $label = $created['label'] ?? null;
            if (is_array($label) && isset($label['id'])) {
                return (string) $label['id'];
            }
        } catch (Throwable $e) {
            Log::warning('Falha ao garantir label de estágio no WhatsApp.', [
                'connection_id' => $connection->id,
                'stage_id' => $stage->id,
                'error' => $e->getMessage(),
            ]);
        }

        return null;
    }

    public function moveCardLabels(
        Connection $connection,
        ?string $jid,
        ?PipelineStage $from,
        ?PipelineStage $to,
    ): void {
        $jid = trim((string) $jid);
        if ($jid === '' || ! $this->canSync($connection)) {
            return;
        }

        if ($from && $to && $this->labelName($from) === $this->labelName($to)) {
            return;
        }

        try {
            $client = new WhatsappApiClient($connection);
            $sessionId = (string) $connection->session_id;
            $existing = $this->indexLabelsByName($client->listLabels($sessionId));

            if ($from) {
                $fromName = $this->labelName($from);
                $fromId = $existing[$fromName] ?? null;
                if ($fromId) {
                    try {
                        $client->unlinkLabel($sessionId, $fromId, $jid);
                    } catch (Throwable $e) {
                        Log::warning('Falha ao remover label antiga no WhatsApp.', [
                            'connection_id' => $connection->id,
                            'jid' => $jid,
                            'label' => $fromName,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            }

            if ($to) {
                $toName = $this->labelName($to);
                $toId = $existing[$toName] ?? null;
                if (! $toId) {
                    $created = $client->createLabel($sessionId, $toName);
                    $label = $created['label'] ?? null;
                    $toId = is_array($label) && isset($label['id']) ? (string) $label['id'] : null;
                }

                if ($toId) {
                    $client->linkLabel($sessionId, $toId, $jid);
                }
            }
        } catch (Throwable $e) {
            Log::warning('Falha ao sincronizar labels do card no WhatsApp.', [
                'connection_id' => $connection->id,
                'jid' => $jid,
                'from_stage_id' => $from?->id,
                'to_stage_id' => $to?->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function applyStageLabel(Connection $connection, ?string $jid, ?PipelineStage $stage): void
    {
        $this->moveCardLabels($connection, $jid, null, $stage);
    }

    private function canSync(Connection $connection): bool
    {
        return $connection->status === 'connected'
            && (bool) $connection->is_business
            && filled($connection->session_id)
            && $connection->hasCredentials();
    }

    /**
     * @return array<string, string> name => id
     */
    private function indexLabelsByName(array $listResponse): array
    {
        $map = [];
        $labels = $listResponse['labels'] ?? [];
        if (! is_array($labels)) {
            return $map;
        }

        foreach ($labels as $label) {
            if (! is_array($label)) {
                continue;
            }
            $name = isset($label['name']) ? (string) $label['name'] : '';
            $id = isset($label['id']) ? (string) $label['id'] : '';
            if ($name !== '' && $id !== '') {
                $map[$name] = $id;
            }
        }

        return $map;
    }
}
