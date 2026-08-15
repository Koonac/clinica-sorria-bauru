<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->unsignedInteger('whatsapp_attendance_auto_close_minutes')
                ->default(10)
                ->after('whatsapp_agent_auto_resume_hours');
        });
    }

    public function down(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->dropColumn('whatsapp_attendance_auto_close_minutes');
        });
    }
};
