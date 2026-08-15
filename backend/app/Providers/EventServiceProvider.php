<?php

namespace App\Providers;

use App\Events\Crm\WhatsappInboundMessageReceived;
use App\Events\Crm\WhatsappMessageStored;
use App\Listeners\Crm\DispatchWhatsappAiReplyJob;
use App\Listeners\Crm\PersistInboundWhatsappMessage;
use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

class EventServiceProvider extends ServiceProvider
{
    /**
     * @var array<class-string, array<int, class-string>>
     */
    protected $listen = [
        WhatsappInboundMessageReceived::class => [
            PersistInboundWhatsappMessage::class,
        ],
        WhatsappMessageStored::class => [
            DispatchWhatsappAiReplyJob::class,
        ],
    ];

    public function shouldDiscoverEvents(): bool
    {
        return false;
    }
}
