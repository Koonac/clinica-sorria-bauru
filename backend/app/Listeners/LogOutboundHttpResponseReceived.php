<?php

namespace App\Listeners;

use App\Services\LogOutboundHttpRequest;
use Illuminate\Http\Client\Events\ResponseReceived;

class LogOutboundHttpResponseReceived
{
    public function __construct(private LogOutboundHttpRequest $logger) {}

    public function handle(ResponseReceived $event): void
    {
        $this->logger->handleResponseReceived($event);
    }
}
