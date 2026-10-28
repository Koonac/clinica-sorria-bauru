<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Crm\CrmNotification;
use App\Services\Crm\ListCrmNotifications;
use App\Services\Crm\MarkCrmNotificationsRead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CrmNotificationController extends Controller
{
    public function index(Request $request, ListCrmNotifications $list): JsonResponse
    {
        $filters = $request->validate([
            'unread' => ['sometimes', 'boolean'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $filters['unread'] = $request->boolean('unread');

        return response()->json($list->handle($request->user(), $filters));
    }

    public function read(Request $request, CrmNotification $notification, MarkCrmNotificationsRead $mark): JsonResponse
    {
        $mark->handle($request->user(), [(int) $notification->id]);

        return response()->json(['data' => ['id' => $notification->id]]);
    }

    public function readAll(Request $request, MarkCrmNotificationsRead $mark): JsonResponse
    {
        return response()->json(['data' => ['marked' => $mark->handle($request->user())]]);
    }
}
