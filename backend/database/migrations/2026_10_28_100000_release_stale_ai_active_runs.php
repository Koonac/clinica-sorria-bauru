<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Solta marcas de "IA processando" de jobs que morreram no meio (deploy/restart):
     * contam no máximo o teto de uma execução (600s) e param de crescer no dashboard.
     */
    public function up(): void
    {
        DB::table('whatsapp_attendance_segments')
            ->whereNotNull('active_started_at')
            ->where('active_started_at', '<', now()->subSeconds(600))
            ->update([
                'active_seconds' => DB::raw('COALESCE(active_seconds, 0) + 600'),
                'active_started_at' => null,
            ]);
    }

    public function down(): void
    {
        // Correção de dados: sem rollback.
    }
};
