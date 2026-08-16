<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->string('whatsapp_finalize_notice', 500)
                ->default('_finalizando chamado_')
                ->after('whatsapp_attendance_auto_close_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->dropColumn('whatsapp_finalize_notice');
        });
    }
};
