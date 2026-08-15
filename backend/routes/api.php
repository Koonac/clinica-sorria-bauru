<?php

use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\Auth\UserController;
use App\Http\Controllers\Api\Crm\ActivityController;
use App\Http\Controllers\Api\Crm\AgentController;
use App\Http\Controllers\Api\Crm\AttendantController;
use App\Http\Controllers\Api\Crm\ClinicController;
use App\Http\Controllers\Api\Crm\ClinicaController;
use App\Http\Controllers\Api\Crm\ClinicServiceController;
use App\Http\Controllers\Api\Crm\ConnectionController;
use App\Http\Controllers\Api\Crm\ContactController;
use App\Http\Controllers\Api\Crm\DealController;
use App\Http\Controllers\Api\Crm\LeadController;
use App\Http\Controllers\Api\Crm\OrganizationController;
use App\Http\Controllers\Api\Crm\PipelineController;
use App\Http\Controllers\Api\Crm\PipelineStageController;
use App\Http\Controllers\Api\Crm\SourceController;
use App\Http\Controllers\Api\Crm\StatsController;
use App\Http\Controllers\Api\Crm\TaskController;
use App\Http\Controllers\Api\Crm\WhatsappCampaignController;
use App\Http\Controllers\Api\Crm\WhatsappController;
use App\Http\Controllers\Api\Finance\FinanceStatsController;
use App\Http\Controllers\Api\Finance\FinancialAccountController;
use App\Http\Controllers\Api\Finance\FinancialEntryController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])
        ->middleware('throttle:10,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('password', [AuthController::class, 'changePassword']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::post('logout-all', [AuthController::class, 'logoutAll']);
    });
});

Route::prefix('v1/users')->middleware(['auth:sanctum', 'role:admin'])->group(function () {
    Route::get('/', [UserController::class, 'index']);
    Route::post('/', [UserController::class, 'store']);
    Route::get('{user}', [UserController::class, 'show']);
    Route::patch('{user}', [UserController::class, 'update']);
    Route::delete('{user}', [UserController::class, 'destroy']);
});

Route::prefix('v1/clinics')->middleware(['auth:sanctum'])->group(function () {
    Route::get('/', [ClinicController::class, 'index']);
    Route::post('/', [ClinicController::class, 'store'])->middleware('role:admin');
    Route::get('{clinic}', [ClinicController::class, 'show']);
    Route::patch('{clinic}', [ClinicController::class, 'update'])->middleware('role:admin');
});

Route::prefix('v1/crm')->group(function () {
    Route::post('whatsapp/webhooks/notifications', [WhatsappController::class, 'notificationsWebhook']);
    Route::post('whatsapp/webhooks/messages', [WhatsappController::class, 'messagesWebhook']);
});

Route::prefix('v1/crm')->middleware(['auth:sanctum', 'clinic'])->group(function () {
    Route::get('leads', [LeadController::class, 'index']);
    Route::post('leads', [LeadController::class, 'store']);
    Route::get('leads/{lead}', [LeadController::class, 'show']);
    Route::patch('leads/{lead}', [LeadController::class, 'update']);
    Route::delete('leads/{lead}', [LeadController::class, 'destroy']);
    Route::post('leads/{lead}/convert', [LeadController::class, 'convert']);
    Route::post('leads/{lead}/move', [LeadController::class, 'move']);
    Route::post('leads/{lead}/agent/resume', [LeadController::class, 'resumeAgent']);
    Route::post('leads/{lead}/agent/pause', [LeadController::class, 'pauseAgent']);
    Route::post('leads/{lead}/whatsapp/finalize', [LeadController::class, 'finalizeWhatsapp']);

    Route::get('agents', [AgentController::class, 'index']);
    Route::post('agents', [AgentController::class, 'store']);
    Route::get('agents/{agent}', [AgentController::class, 'show']);
    Route::patch('agents/{agent}', [AgentController::class, 'update']);
    Route::delete('agents/{agent}', [AgentController::class, 'destroy']);
    Route::post('agents/{agent}/activate', [AgentController::class, 'activate']);
    Route::post('agents/{agent}/deactivate', [AgentController::class, 'deactivate']);

    Route::get('deals', [DealController::class, 'index']);
    Route::post('deals', [DealController::class, 'store']);
    Route::get('deals/{deal}', [DealController::class, 'show']);
    Route::patch('deals/{deal}', [DealController::class, 'update']);
    Route::delete('deals/{deal}', [DealController::class, 'destroy']);

    Route::get('pipeline', [PipelineController::class, 'index']);
    Route::get('pipeline-stages', [PipelineStageController::class, 'index']);
    Route::post('pipeline-stages', [PipelineStageController::class, 'store']);
    Route::patch('pipeline-stages/order', [PipelineStageController::class, 'order']);
    Route::patch('pipeline-stages/{pipelineStage}', [PipelineStageController::class, 'update']);
    Route::delete('pipeline-stages/{pipelineStage}', [PipelineStageController::class, 'destroy']);
    Route::get('sources', [SourceController::class, 'index']);

    Route::get('clinicas', [ClinicaController::class, 'index']);
    Route::get('clinicas/{clinica}', [ClinicaController::class, 'show']);

    Route::get('services', [ClinicServiceController::class, 'index']);
    Route::post('services', [ClinicServiceController::class, 'store']);
    Route::get('services/{service}', [ClinicServiceController::class, 'show']);
    Route::patch('services/{service}', [ClinicServiceController::class, 'update']);
    Route::delete('services/{service}', [ClinicServiceController::class, 'destroy']);

    Route::get('stats/leads-por-dia', [StatsController::class, 'leadsPorDia'])->middleware('role:admin');
    Route::get('stats/attendance', [StatsController::class, 'attendance'])->middleware('role:admin');

    Route::get('activities', [ActivityController::class, 'index']);
    Route::post('activities', [ActivityController::class, 'store']);

    Route::get('tasks', [TaskController::class, 'index']);
    Route::post('tasks', [TaskController::class, 'store']);
    Route::patch('tasks/{task}', [TaskController::class, 'update']);
    Route::delete('tasks/{task}', [TaskController::class, 'destroy']);

    Route::get('contacts', [ContactController::class, 'index']);
    Route::get('organizations', [OrganizationController::class, 'index']);
    Route::post('organizations', [OrganizationController::class, 'store']);

    Route::get('connection', [ConnectionController::class, 'show']);
    Route::get('connection/status', [ConnectionController::class, 'status']);
    Route::put('connection/credentials', [ConnectionController::class, 'updateCredentials'])->middleware('role:admin');
    Route::put('connection/settings', [ConnectionController::class, 'updateSettings'])->middleware('role:admin');
    Route::post('connection/connect', [ConnectionController::class, 'connect'])->middleware('role:admin');
    Route::get('connection/qrcode', [ConnectionController::class, 'qrcode'])->middleware('role:admin');
    Route::delete('connection/disconnect', [ConnectionController::class, 'disconnect'])->middleware('role:admin');

    Route::get('attendants', [AttendantController::class, 'index']);

    Route::get('whatsapp/chats', [WhatsappController::class, 'chats']);
    Route::post('whatsapp/chats/read', [WhatsappController::class, 'markChatRead']);
    Route::get('whatsapp/avatars/{contact}', [WhatsappController::class, 'avatar']);
    Route::get('whatsapp/messages', [WhatsappController::class, 'messages']);
    Route::post('whatsapp/send', [WhatsappController::class, 'send']);

    Route::get('campaigns/openrouter-models', [WhatsappCampaignController::class, 'openrouterModels']);
    Route::get('campaigns', [WhatsappCampaignController::class, 'index']);
    Route::post('campaigns', [WhatsappCampaignController::class, 'store']);
    Route::get('campaigns/{campaign}', [WhatsappCampaignController::class, 'show']);
    Route::patch('campaigns/{campaign}', [WhatsappCampaignController::class, 'update']);
    Route::post('campaigns/{campaign}/import-csv', [WhatsappCampaignController::class, 'importCsv']);
    Route::post('campaigns/{campaign}/recipients', [WhatsappCampaignController::class, 'storeRecipient']);
    Route::patch('campaigns/{campaign}/recipients/{recipient}', [WhatsappCampaignController::class, 'updateRecipient']);
    Route::post('campaigns/{campaign}/recipients/{recipient}/apply-default', [WhatsappCampaignController::class, 'applyDefaultToRecipient']);
    Route::post('campaigns/{campaign}/generate-messages', [WhatsappCampaignController::class, 'generateMessages']);
    Route::post('campaigns/{campaign}/start', [WhatsappCampaignController::class, 'start']);
    Route::post('campaigns/{campaign}/pause', [WhatsappCampaignController::class, 'pause']);
    Route::post('campaigns/{campaign}/cancel', [WhatsappCampaignController::class, 'cancel']);
});

Route::prefix('v1/finance')->middleware(['auth:sanctum', 'clinic'])->group(function () {
    Route::get('accounts', [FinancialAccountController::class, 'index']);
    Route::post('accounts', [FinancialAccountController::class, 'store']);
    Route::patch('accounts/{account}', [FinancialAccountController::class, 'update']);
    Route::delete('accounts/{account}', [FinancialAccountController::class, 'destroy']);

    Route::get('entries', [FinancialEntryController::class, 'index']);
    Route::post('entries', [FinancialEntryController::class, 'store']);
    Route::get('entries/{entry}', [FinancialEntryController::class, 'show']);
    Route::patch('entries/{entry}', [FinancialEntryController::class, 'update']);
    Route::delete('entries/{entry}', [FinancialEntryController::class, 'destroy']);
    Route::post('entries/{entry}/settle', [FinancialEntryController::class, 'settle']);
    Route::delete('entries/{entry}/settle', [FinancialEntryController::class, 'unsettle']);

    Route::get('stats/overview', [FinanceStatsController::class, 'overview']);
});
