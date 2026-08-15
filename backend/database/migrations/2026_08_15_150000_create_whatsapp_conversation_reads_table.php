<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_conversation_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->constrained()->cascadeOnDelete();
            $table->foreignId('connection_id')->constrained('connections')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('conversation_key', 120);
            $table->foreignId('last_read_message_id')->nullable()->constrained('whatsapp_messages')->nullOnDelete();
            $table->timestampTz('last_read_at')->nullable();
            $table->timestampsTz();

            $table->unique(
                ['connection_id', 'user_id', 'conversation_key'],
                'whatsapp_conversation_reads_unique'
            );
            $table->index(['connection_id', 'conversation_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_conversation_reads');
    }
};
