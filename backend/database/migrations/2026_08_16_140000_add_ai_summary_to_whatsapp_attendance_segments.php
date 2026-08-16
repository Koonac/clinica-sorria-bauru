<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_attendance_segments', function (Blueprint $table) {
            $table->text('ai_summary')->nullable()->after('source');
            $table->timestampTz('ai_summary_at')->nullable()->after('ai_summary');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_attendance_segments', function (Blueprint $table) {
            $table->dropColumn(['ai_summary', 'ai_summary_at']);
        });
    }
};
