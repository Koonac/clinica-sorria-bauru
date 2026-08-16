<?php

namespace App\Listeners;

use App\Services\LogOutboundHttpRequest;
use Illuminate\Http\Client\Events\ConnectionFailed;

class LogOutboundHttpConnectionFailed
{
    public function __construct(private LogOutboundHttpRequest $logger) {}

    public function handle(ConnectionFailed $event): void
    {
        $this->logger->handleConnectionFailed($event);
    }
}
