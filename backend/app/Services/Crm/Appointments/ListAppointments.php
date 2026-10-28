<?php

namespace App\Services\Crm\Appointments;

use App\Models\Crm\Appointment;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ListAppointments
{
    /**
     * @param  array{view?: string|null, status?: string|null, lead_id?: int|null, from?: string|null, to?: string|null, search?: string|null}  $filters
     *                                                                                                                                           view: pre_booking | upcoming | history
     */
    public function handle(array $filters = []): LengthAwarePaginator
    {
        $query = Appointment::query()
            ->with(['lead:id,name,mobile,whatsapp_jid,attendance_status', 'service:id,name,duration_minutes', 'confirmedBy:id,name']);

        switch ($filters['view'] ?? null) {
            case 'pre_booking':
                $query->where('status', Appointment::STATUS_PRE_BOOKED)->orderBy('created_at');
                break;
            case 'upcoming':
                $query->whereIn('status', [Appointment::STATUS_SCHEDULED, Appointment::STATUS_CONFIRMED])
                    ->where('starts_at', '>=', now()->subHours(12))
                    ->orderBy('starts_at');
                break;
            case 'history':
                $query->where(function ($q) {
                    $q->whereIn('status', [Appointment::STATUS_CANCELLED, Appointment::STATUS_DONE, Appointment::STATUS_NO_SHOW])
                        ->orWhere(function ($inner) {
                            $inner->whereIn('status', [Appointment::STATUS_SCHEDULED, Appointment::STATUS_CONFIRMED])
                                ->where('starts_at', '<', now()->subHours(12));
                        });
                })->orderByDesc('updated_at');
                break;
            default:
                $query->latest('id');
        }

        if (filled($filters['status'] ?? null)) {
            $query->where('status', $filters['status']);
        }
        if (filled($filters['lead_id'] ?? null)) {
            $query->where('lead_id', (int) $filters['lead_id']);
        }
        if (filled($filters['from'] ?? null)) {
            $query->where('starts_at', '>=', $filters['from']);
        }
        if (filled($filters['to'] ?? null)) {
            $query->where('starts_at', '<=', $filters['to']);
        }
        if (filled($filters['search'] ?? null)) {
            $like = '%'.trim((string) $filters['search']).'%';
            $query->whereHas('lead', fn ($q) => $q->where(fn ($inner) => $inner
                ->whereLike('name', $like, caseSensitive: false)
                ->orWhereLike('mobile', $like, caseSensitive: false)));
        }

        return $query->paginate(50);
    }
}
