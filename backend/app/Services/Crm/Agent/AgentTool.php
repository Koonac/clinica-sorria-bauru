<?php

namespace App\Services\Crm\Agent;

interface AgentTool
{
    public function name(): string;

    /**
     * @return array<string, mixed> OpenAI function tool schema (type=function wrapper aplicado no registry)
     */
    public function schema(): array;

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    public function handle(array $arguments, AgentContext $context): array;
}
