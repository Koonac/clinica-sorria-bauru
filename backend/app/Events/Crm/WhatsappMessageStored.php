<?php

namespace App\Events\Crm;

use App\Models\Crm\WhatsappMessage;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WhatsappMessageStored
{
    use Dispatchable, SerializesModels;

    public function __construct(public WhatsappMessage $message) {}
}
