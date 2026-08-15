<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('status', 20)->default('draft'); // draft|queued|running|paused|completed|cancelled|failed
            $table->unsignedInteger('delay_between_contacts_sec')->default(45);
            $table->unsignedInteger('delay_jitter_sec')->default(15);
            $table->unsignedInteger('total_recipients')->default(0);
            $table->unsignedInteger('sent_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->timestampsTz();

            $table->index(['user_id', 'status']);
        });

        Schema::create('whatsapp_campaign_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('whatsapp_campaign_id')->constrained('whatsapp_campaigns')->cascadeOnDelete();
            $table->unsignedInteger('position')->default(0);
            $table->text('message_body');
            $table->unsignedInteger('delay_after_sec')->default(10);
            $table->timestampsTz();

            $table->index(['whatsapp_campaign_id', 'position']);
        });

        Schema::create('whatsapp_campaign_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('whatsapp_campaign_id')->constrained('whatsapp_campaigns')->cascadeOnDelete();
            $table->string('full_name')->nullable();
            $table->string('phone', 40);
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('pending'); // pending|sending|sent|failed|skipped
            $table->boolean('use_custom_message')->default(false);
            $table->longText('custom_message')->nullable();
            $table->text('error_message')->nullable();
            $table->timestampTz('last_sent_at')->nullable();
            $table->timestampsTz();

            $table->index(['whatsapp_campaign_id', 'status']);
        });

        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->foreignId('whatsapp_campaign_id')
                ->nullable()
                ->after('contact_id')
                ->constrained('whatsapp_campaigns')
                ->nullOnDelete();
            $table->foreignId('whatsapp_campaign_recipient_id')
                ->nullable()
                ->after('whatsapp_campaign_id')
                ->constrained('whatsapp_campaign_recipients')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('whatsapp_campaign_recipient_id');
            $table->dropConstrainedForeignId('whatsapp_campaign_id');
        });

        Schema::dropIfExists('whatsapp_campaign_recipients');
        Schema::dropIfExists('whatsapp_campaign_messages');
        Schema::dropIfExists('whatsapp_campaigns');
    }
};
