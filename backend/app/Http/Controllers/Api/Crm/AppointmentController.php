<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\ConfirmPreBookingRequest;
use App\Http\Requests\Crm\StoreAppointmentRequest;
use App\Models\Crm\Appointment;
use App\Models\Crm\Lead;
use App\Services\Crm\Appointments\CancelAppointment;
use App\Services\Crm\Appointments\ConfirmPreBooking;
use App\Services\Crm\Appointments\ListAppointments;
use App\Services\Crm\Appointments\MarkAppointmentConfirmed;
use App\Services\Crm\Appointments\ScheduleAppointment;
use App\Services\Crm\Appointments\SendAppointmentScheduledNotice;
use App\Services\Crm\Appointments\UpdateAppointmentOutcome;
use App\Services\Crm\ListAvailableCalendarSlots;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use RuntimeException;

class AppointmentController extends Controller
{
    public function index(Request $request, ListAppointments $list): JsonResponse
    {
        $filters = $request->validate([
            'view' => ['sometimes', 'nullable', Rule::in(['pre_booking', 'upcoming', 'history'])],
            'status' => ['sometimes', 'nullable', Rule::in(Appointment::STATUSES)],
            'lead_id' => ['sometimes', 'nullable', 'integer'],
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);

        return response()->json($list->handle($filters));
    }

    public function store(
        StoreAppointmentRequest $request,
        ScheduleAppointment $schedule,
        SendAppointmentScheduledNotice $notice,
    ): JsonResponse {
        $data = $request->validated();
        $lead = Lead::query()->findOrFail((int) $data['lead_id']);
        $user = $request->user();

        try {
            $result = $schedule->handle($lead, [
                'title' => $data['title'],
                'starts_at' => $data['starts_at'],
                'ends_at' => $data['ends_at'],
                'notes' => $data['notes'] ?? null,
                'clinic_service_id' => $data['clinic_service_id'] ?? null,
                'origin_label' => 'Agendado por '.$user->name,
            ], $user->id, Appointment::SOURCE_MANUAL);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $notified = ['sent' => false, 'error' => null];
        if ($request->boolean('notify_patient')) {
            $notified = $notice->handle($result['appointment'], $user->id);
        }

        return response()->json([
            'data' => $result['appointment'],
            'meta' => [
                'calendar_error' => $result['calendar_error'],
                'patient_notified' => $notified['sent'],
                'notify_error' => $notified['error'],
            ],
        ], 201);
    }

    public function confirm(ConfirmPreBookingRequest $request, Appointment $appointment, ConfirmPreBooking $confirm): JsonResponse
    {
        try {
            $result = $confirm->handle($appointment, $request->validated(), $request->user());
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => $result['appointment'],
            'meta' => [
                'calendar_error' => $result['calendar_error'],
                'patient_notified' => $result['patient_notified'],
                'notify_error' => $result['notify_error'],
            ],
        ]);
    }

    public function cancel(Request $request, Appointment $appointment, CancelAppointment $cancel): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $updated = $cancel->handle($appointment, $data['reason'] ?? null, $request->user()?->id);

        return response()->json(['data' => $updated->fresh(['lead', 'service'])]);
    }

    public function outcome(
        Request $request,
        Appointment $appointment,
        UpdateAppointmentOutcome $outcome,
        MarkAppointmentConfirmed $confirm,
    ): JsonResponse {
        $data = $request->validate([
            'outcome' => ['required', Rule::in([Appointment::STATUS_CONFIRMED, ...UpdateAppointmentOutcome::OUTCOMES])],
        ]);

        try {
            $updated = $data['outcome'] === Appointment::STATUS_CONFIRMED
                ? $confirm->handle($appointment, $request->user()?->id)
                : $outcome->handle($appointment, $data['outcome'], $request->user()?->id);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $updated->fresh(['lead', 'service'])]);
    }

    public function availableSlots(Request $request, ListAvailableCalendarSlots $slots): JsonResponse
    {
        $data = $request->validate([
            'data' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'dias' => ['sometimes', 'integer', 'min:1', 'max:7'],
            'duracao_minutos' => ['sometimes', 'integer', 'min:15', 'max:180'],
        ]);

        try {
            return response()->json(['data' => $slots->handle($data)]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
