<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->timestampTz('whatsapp_conversation_closed_at')->nullable()->after('whatsapp_agent_resume_at');
            $table->foreignId('whatsapp_conversation_closed_by')
                ->nullable()
                ->after('whatsapp_conversation_closed_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->timestampTz('whatsapp_auto_close_at')->nullable()->after('whatsapp_conversation_closed_by');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropConstrainedForeignId('whatsapp_conversation_closed_by');
            $table->dropColumn([
                'whatsapp_conversation_closed_at',
                'whatsapp_auto_close_at',
            ]);
        });
    }
};
