<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->string('type', 40);
            $table->string('priority', 10)->default('normal'); // normal | urgent
            $table->string('title', 190);
            $table->text('body')->nullable();
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('appointment_id')->nullable()->constrained()->nullOnDelete();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->index(['clinic_id', 'created_at']);
        });

        Schema::create('crm_notification_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('crm_notification_id')->constrained('crm_notifications')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('read_at');

            $table->unique(['crm_notification_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_notification_reads');
        Schema::dropIfExists('crm_notifications');
    }
};
