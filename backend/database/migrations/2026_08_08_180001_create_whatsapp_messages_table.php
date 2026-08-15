<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('session_id', 120)->index();
            $table->string('whatsapp_jid', 80);
            $table->string('whatsapp_lid', 80)->nullable();
            $table->string('phone_number', 40)->nullable();
            $table->string('contact_name', 190)->nullable();
            $table->string('direction', 10); // inbound | outbound
            $table->text('body')->nullable();
            $table->string('message_id', 190)->nullable();
            $table->string('type', 40)->nullable();
            $table->boolean('has_media')->default(false);
            $table->jsonb('media')->nullable();
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('deal_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->jsonb('raw')->nullable();
            $table->timestampTz('wa_timestamp')->nullable();
            $table->timestampsTz();

            $table->index(['user_id', 'whatsapp_jid']);
            $table->index('lead_id');
            $table->unique(['session_id', 'message_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_messages');
    }
};
