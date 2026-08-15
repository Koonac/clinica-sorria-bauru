<?php

use App\Http\Controllers\SwaggerController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'ok' => true,
        'app' => config('app.name'),
        'endpoints' => [
            'docs' => '/docs',
            'api' => '/api/v1',
            'crm' => '/api/v1/crm',
            'finance' => '/api/v1/finance',
            'health' => '/up',
        ],
    ]);
});

Route::get('/docs', [SwaggerController::class, 'ui']);
Route::get('/docs/swagger.json', [SwaggerController::class, 'json']);
