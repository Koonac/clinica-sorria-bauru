<?php

namespace App\Events\Crm;

use App\Models\Crm\Connection;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WhatsappInboundMessageReceived
{
    use Dispatchable, SerializesModels;

    /**
     * @param  array<string, mixed>  $payload
     */
    public function __construct(
        public Connection $connection,
        public string $sessionId,
        public array $payload,
    ) {}
}
