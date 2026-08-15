<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use RuntimeException;
use Throwable;

class GetWhatsappConnectionStatus
{
    public function __construct(
        private UpsertClinicConnection $upsert,
        private SyncWhatsappLabels $labelSync,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function handle(?int $userId = null): array
    {
        $connection = $this->upsert->handle([], $userId);

        if (filled($connection->session_id) && $connection->hasCredentials()) {
            try {
                $remote = (new WhatsappApiClient($connection))->status((string) $connection->session_id);
                $remoteStatus = $remote['status'] ?? null;
                if (is_string($remoteStatus) && in_array($remoteStatus, Connection::STATUSES, true)) {
                    $eraBusiness = (bool) $connection->is_business;
                    $connection->status = $remoteStatus;
                    if ($remoteStatus === 'connected') {
                        $connection->qr = null;
                        $info = $remote['info'] ?? null;
                        if (is_array($info) && isset($info['wid']['user'])) {
                            $connection->phone = (string) $info['wid']['user'];
                        }
                        if (array_key_exists('isBusiness', $remote)) {
                            $connection->is_business = (bool) $remote['isBusiness'];
                        }
                    } else {
                        $connection->is_business = false;
                    }
                    $connection->save();

                    if (! $eraBusiness && $connection->is_business) {
                        $this->labelSync->ensurePipelineLabels($connection->fresh());
                    }
                }
            } catch (Throwable) {
                // Mantém status local se a API estiver indisponível.
            }
        }

        return $this->publicState($connection->fresh());
    }

    /**
     * @return array{session_id: string|null, qr: string|null, source: string}
     */
    public function qrcode(?int $userId = null): array
    {
        $connection = $this->upsert->handle([], $userId);

        if (filled($connection->qr)) {
            return [
                'session_id' => $connection->session_id,
                'qr' => $connection->qr,
                'source' => 'local',
            ];
        }

        if (! filled($connection->session_id) || ! $connection->hasCredentials()) {
            throw new RuntimeException('Nenhuma sessão WhatsApp ativa.', 404);
        }

        try {
            $result = (new WhatsappApiClient($connection))->qrcode((string) $connection->session_id);
        } catch (RuntimeException $e) {
            throw new RuntimeException(
                $e->getMessage(),
                $e->getCode() === 404 ? 404 : 502,
                $e,
            );
        }

        $qr = $result['qrImage'] ?? $result['qr'] ?? null;
        if (is_string($qr) && $qr !== '') {
            $connection->qr = $qr;
            $connection->save();
        }

        return [
            'session_id' => $connection->session_id,
            'qr' => is_string($qr) ? $qr : null,
            'source' => 'api',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function publicState(Connection $connection): array
    {
        return array_merge($connection->toPublicArray(), [
            'has_qr' => filled($connection->qr),
        ]);
    }
}
