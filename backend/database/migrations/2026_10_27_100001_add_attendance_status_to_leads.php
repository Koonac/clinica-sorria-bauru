<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('attendance_status', 30)->default('novo')->index();
            $table->unsignedSmallInteger('whatsapp_follow_up_step')->default(0);
            $table->timestamp('whatsapp_follow_up_due_at')->nullable()->index();
        });

        // Backfill: quem já conversou está em atendimento; quem tem agendamento futuro do agent, agendado.
        DB::table('leads')
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('whatsapp_messages')
                    ->whereColumn('whatsapp_messages.lead_id', 'leads.id');
            })
            ->update(['attendance_status' => 'em_atendimento']);

        DB::table('leads')
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('tasks')
                    ->join('activities', function ($join) {
                        $join->on('activities.lead_id', '=', 'tasks.lead_id')
                            ->where('activities.subject', 'like', 'Agendamento criado pelo agent:%');
                    })
                    ->whereColumn('tasks.lead_id', 'leads.id')
                    ->whereNull('tasks.done_at')
                    ->where('tasks.due_at', '>=', now());
            })
            ->update(['attendance_status' => 'agendado']);
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['attendance_status']);
            $table->dropIndex(['whatsapp_follow_up_due_at']);
            $table->dropColumn(['attendance_status', 'whatsapp_follow_up_step', 'whatsapp_follow_up_due_at']);
        });
    }
};
