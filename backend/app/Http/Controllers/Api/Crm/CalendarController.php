<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\StoreCalendarEventRequest;
use App\Http\Requests\Crm\UpdateCalendarEventRequest;
use App\Services\Crm\CalendarStatus;
use App\Services\Crm\CreateCalendarEvent;
use App\Services\Crm\DeleteCalendarEvent;
use App\Services\Crm\ListCalendarEvents;
use App\Services\Crm\UpdateCalendarEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class CalendarController extends Controller
{
    public function status(CalendarStatus $status): JsonResponse
    {
        return response()->json(['data' => $status->handle()]);
    }

    public function events(Request $request, ListCalendarEvents $list): JsonResponse
    {
        $filters = $request->validate([
            'timeMin' => ['required', 'string', 'max:64'],
            'timeMax' => ['required', 'string', 'max:64'],
        ], [
            'timeMin.required' => 'timeMin é obrigatório.',
            'timeMax.required' => 'timeMax é obrigatório.',
        ]);

        try {
            return response()->json(['data' => $list->handle($filters['timeMin'], $filters['timeMax'])]);
        } catch (RuntimeException $e) {
            return $this->calendarError($e);
        }
    }

    public function store(StoreCalendarEventRequest $request, CreateCalendarEvent $create): JsonResponse
    {
        try {
            return response()->json(['data' => $create->handle($request->validated())], 201);
        } catch (RuntimeException $e) {
            return $this->calendarError($e);
        }
    }

    public function update(UpdateCalendarEventRequest $request, string $eventId, UpdateCalendarEvent $update): JsonResponse
    {
        try {
            return response()->json(['data' => $update->handle($eventId, $request->validated())]);
        } catch (RuntimeException $e) {
            return $this->calendarError($e);
        }
    }

    public function destroy(string $eventId, DeleteCalendarEvent $delete): JsonResponse
    {
        try {
            return response()->json(['data' => $delete->handle($eventId)]);
        } catch (RuntimeException $e) {
            return $this->calendarError($e);
        }
    }

    private function calendarError(RuntimeException $e): JsonResponse
    {
        $message = $e->getMessage();
        $lower = mb_strtolower($message);
        $status = 502;
        if (str_contains($lower, 'não configurado')) {
            $status = 503;
        } elseif (
            str_contains($lower, 'inválid')
            || str_contains($lower, 'obrigatório')
            || str_contains($lower, 'nenhum campo')
            || str_contains($lower, 'posterior')
        ) {
            $status = 422;
        }

        return response()->json(['message' => $message], $status);
    }
}
