<?php

namespace App\Events\Crm;

use App\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WhatsappInboundMessageReceived
{
    use Dispatchable, SerializesModels;

    /**
     * @param  array<string, mixed>  $payload
     */
    public function __construct(
        public User $user,
        public string $sessionId,
        public array $payload,
    ) {}
}
