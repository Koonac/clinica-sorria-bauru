<?php

namespace App\Providers;

use App\Events\Crm\WhatsappInboundMessageReceived;
use App\Events\Crm\WhatsappMessageStored;
use App\Listeners\Crm\DispatchWhatsappAiReplyJob;
use App\Listeners\Crm\PersistInboundWhatsappMessage;
use App\Listeners\LogOutboundHttpConnectionFailed;
use App\Listeners\LogOutboundHttpResponseReceived;
use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;
use Illuminate\Http\Client\Events\ConnectionFailed;
use Illuminate\Http\Client\Events\ResponseReceived;

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
        ResponseReceived::class => [
            LogOutboundHttpResponseReceived::class,
        ],
        ConnectionFailed::class => [
            LogOutboundHttpConnectionFailed::class,
        ],
    ];

    public function shouldDiscoverEvents(): bool
    {
        return false;
    }
}
