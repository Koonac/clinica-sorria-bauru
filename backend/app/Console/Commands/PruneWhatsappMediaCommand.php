<?php

namespace App\Console\Commands;

use App\Services\Crm\PruneWhatsappMedia;
use Illuminate\Console\Command;

class PruneWhatsappMediaCommand extends Command
{
    protected $signature = 'crm:prune-whatsapp-media {--dry-run : Conta o que seria apagado sem excluir}';

    protected $description = 'Apaga mídias WhatsApp fora da retenção ou acima do teto por clínica';

    public function handle(PruneWhatsappMedia $pruner): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $result = $pruner->handle($dryRun);

        $mb = number_format($result['max_bytes'] / 1024 / 1024, 0, ',', '.');
        $prefix = $dryRun ? '[dry-run] ' : '';

        $this->info("{$prefix}Retenção: {$result['retention_days']} dia(s) | Teto: {$mb} MB/clínica");
        $this->info("{$prefix}Expirados: {$result['expired']} | Teto: {$result['capped']} | Órfãos: {$result['orphans']}");

        return self::SUCCESS;
    }
}
