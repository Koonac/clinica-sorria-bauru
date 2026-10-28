<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->string('reception_alert_jid', 120)->nullable();
            $table->string('scheduling_mode', 20)->default('direct'); // direct | pre_booking
            $table->boolean('appointment_reminder_enabled')->default(true);
            $table->unsignedSmallInteger('appointment_reminder_hours')->default(24);
            $table->text('appointment_reminder_template')->nullable();
            $table->boolean('whatsapp_follow_up_enabled')->default(false);
            $table->json('whatsapp_follow_up_delays')->nullable();
            $table->unsignedTinyInteger('whatsapp_send_window_start')->default(8);
            $table->unsignedTinyInteger('whatsapp_send_window_end')->default(20);
        });
    }

    public function down(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->dropColumn([
                'reception_alert_jid',
                'scheduling_mode',
                'appointment_reminder_enabled',
                'appointment_reminder_hours',
                'appointment_reminder_template',
                'whatsapp_follow_up_enabled',
                'whatsapp_follow_up_delays',
                'whatsapp_send_window_start',
                'whatsapp_send_window_end',
            ]);
        });
    }
};
