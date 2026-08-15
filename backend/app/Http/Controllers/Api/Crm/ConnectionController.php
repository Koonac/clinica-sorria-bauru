<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\UpdateConnectionCredentialsRequest;
use App\Http\Requests\Crm\UpdateConnectionSettingsRequest;
use App\Services\Crm\ConnectWhatsappConnection;
use App\Services\Crm\DisconnectWhatsappConnection;
use App\Services\Crm\GetWhatsappConnectionStatus;
use App\Services\Crm\UpdateWhatsappConnectionCredentials;
use App\Services\Crm\UpdateWhatsappConnectionSettings;
use App\Services\Crm\UpsertClinicConnection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class ConnectionController extends Controller
{
    public function show(Request $request, UpsertClinicConnection $upsert, GetWhatsappConnectionStatus $status): JsonResponse
    {
        $connection = $upsert->handle([], $request->user()?->id);

        return response()->json(['data' => $status->publicState($connection)]);
    }

    public function updateCredentials(
        UpdateConnectionCredentialsRequest $request,
        UpdateWhatsappConnectionCredentials $service,
        GetWhatsappConnectionStatus $status,
    ): JsonResponse {
        $connection = $service->handle($request->validated(), $request->user()?->id);

        return response()->json(['data' => $status->publicState($connection)]);
    }

    public function updateSettings(
        UpdateConnectionSettingsRequest $request,
        UpdateWhatsappConnectionSettings $service,
        GetWhatsappConnectionStatus $status,
    ): JsonResponse {
        $connection = $service->handle($request->validated(), $request->user()?->id);

        return response()->json(['data' => $status->publicState($connection)]);
    }

    public function connect(Request $request, ConnectWhatsappConnection $service, GetWhatsappConnectionStatus $status): JsonResponse
    {
        try {
            $result = $service->handle($request->user()?->id);
        } catch (RuntimeException $e) {
            $code = $e->getCode();
            $http = ($code >= 400 && $code < 600) ? $code : 502;

            return response()->json(['message' => $e->getMessage()], $http);
        }

        return response()->json([
            'data' => $status->publicState($result['connection']),
            'message' => $result['message'],
        ], 201);
    }

    public function qrcode(Request $request, GetWhatsappConnectionStatus $service): JsonResponse
    {
        try {
            $data = $service->qrcode($request->user()?->id);
        } catch (RuntimeException $e) {
            $code = $e->getCode();
            $http = ($code >= 400 && $code < 600) ? $code : 502;

            return response()->json(['message' => $e->getMessage()], $http);
        }

        return response()->json(['data' => $data]);
    }

    public function status(Request $request, GetWhatsappConnectionStatus $service): JsonResponse
    {
        return response()->json(['data' => $service->handle($request->user()?->id)]);
    }

    public function disconnect(
        Request $request,
        DisconnectWhatsappConnection $service,
        GetWhatsappConnectionStatus $status,
    ): JsonResponse {
        $connection = $service->handle($request->user()?->id);

        return response()->json([
            'data' => $status->publicState($connection),
            'message' => 'WhatsApp desconectado.',
        ]);
    }
}
