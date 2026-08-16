<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'whatsapp' => [
        'url' => rtrim((string) env('WHATSAPP_API_URL', 'http://localhost:3000'), '/'),
        'media_retention_days' => (int) env('WHATSAPP_MEDIA_RETENTION_DAYS', 90),
        'media_max_mb_per_clinic' => (int) env('WHATSAPP_MEDIA_MAX_MB_PER_CLINIC', 2048),
    ],

    'openrouter' => [
        'key' => env('OPENROUTER_API_KEY'),
        'agent_model' => env('OPENROUTER_AGENT_MODEL', 'deepseek/deepseek-v4-pro'),
        // Pré-processamento de mídia do WhatsApp (o modelo do agent não é multimodal)
        'transcription_model' => env('OPENROUTER_TRANSCRIPTION_MODEL', 'openai/whisper-1'),
        'transcription_language' => env('OPENROUTER_TRANSCRIPTION_LANGUAGE', 'pt'),
        'vision_model' => env('OPENROUTER_VISION_MODEL', 'openai/gpt-4o-mini'),
    ],

    'google_calendar' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'refresh_token' => env('GOOGLE_CALENDAR_REFRESH_TOKEN'),
        'calendar_id' => env('GOOGLE_CALENDAR_CALENDAR_ID', 'primary'),
        'timezone' => env('GOOGLE_CALENDAR_TIMEZONE', 'America/Sao_Paulo'),
        // Janela comercial usada por listar_horarios_disponiveis
        'business_hours_start' => (int) env('GOOGLE_CALENDAR_BUSINESS_START', 9),
        'business_hours_end' => (int) env('GOOGLE_CALENDAR_BUSINESS_END', 18),
        'slot_minutes' => (int) env('GOOGLE_CALENDAR_SLOT_MINUTES', 60),
    ],

];
