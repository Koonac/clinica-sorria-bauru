<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const DEFAULT_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT = <<<'PROMPT'
Você resume atendimentos WhatsApp de uma clínica odontológica.
Escreva em português brasileiro, em 3 a 6 bullets factuais curtos.
Inclua: motivo do contato, o que foi feito/combinado e pendências (se houver).
Não invente fatos. Não mencione tools, CRM, transferindo/finalizando chamado nem IDs internos.
PROMPT;

    public function up(): void
    {
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->timestamps();
        });

        DB::table('system_settings')->insert([
            'key' => 'ai_attendance_summary_system_prompt',
            'value' => self::DEFAULT_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('system_settings');
    }
};
