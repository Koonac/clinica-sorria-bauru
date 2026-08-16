<?php

namespace App\Services\Dev;

use App\Models\OutboundHttpLog;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ListOutboundHttpLogs
{
    /**
     * @param  array{provider?: string, status?: int, search?: string, from?: string, to?: string, per_page?: int}  $filters
     */
    public function handle(array $filters = []): LengthAwarePaginator
    {
        $query = OutboundHttpLog::query()->orderByDesc('id');

        if (! empty($filters['provider'])) {
            $query->where('provider', $filters['provider']);
        }

        if (isset($filters['status']) && $filters['status'] !== '' && $filters['status'] !== null) {
            $query->where('response_status', (int) $filters['status']);
        }

        if (! empty($filters['search'])) {
            $like = '%'.trim((string) $filters['search']).'%';
            $query->where(function ($q) use ($like) {
                $q->where('url', 'like', $like)
                    ->orWhere('error', 'like', $like);
            });
        }

        if (! empty($filters['from'])) {
            $query->where('created_at', '>=', $filters['from']);
        }

        if (! empty($filters['to'])) {
            $query->where('created_at', '<=', $filters['to']);
        }

        $perPage = max(10, min(100, (int) ($filters['per_page'] ?? 50)));

        return $query->paginate($perPage)->through(fn (OutboundHttpLog $log) => $this->toListArray($log));
    }

    /**
     * @return array<string, mixed>
     */
    public function toListArray(OutboundHttpLog $log): array
    {
        return [
            'id' => $log->id,
            'clinic_id' => $log->clinic_id,
            'provider' => $log->provider,
            'method' => $log->method,
            'url' => $log->url,
            'response_status' => $log->response_status,
            'duration_ms' => $log->duration_ms,
            'error' => $log->error,
            'created_at' => $log->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toDetailArray(OutboundHttpLog $log): array
    {
        return [
            ...$this->toListArray($log),
            'request_headers' => $log->request_headers,
            'request_body' => $log->request_body,
            'response_body' => $log->response_body,
        ];
    }
}
