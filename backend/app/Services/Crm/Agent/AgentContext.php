<?php

namespace App\Services\Crm\Agent;

use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Deal;
use App\Models\Crm\Lead;
use App\Models\User;

class AgentContext
{
    /**
     * @param  list<array{id: int, name: string, is_lost: bool}>  $leadStages
     * @param  list<string>  $handoffSignals  sinais de urgência/reclamação/pedido de humano nas inbounds do turno
     */
    public function __construct(
        public User $user,
        public Connection $connection,
        public Agent $agent,
        public string $chatKey,
        public string $jid,
        public string $sessionId,
        public ?Lead $lead,
        public ?Deal $deal,
        public array $leadStages,
        public array $handoffSignals = [],
    ) {}
}
