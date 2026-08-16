<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->unsignedSmallInteger('whatsapp_agent_history_limit')
                ->default(40)
                ->after('whatsapp_finalize_notice');
        });
    }

    public function down(): void
    {
        Schema::table('connections', function (Blueprint $table) {
            $table->dropColumn('whatsapp_agent_history_limit');
        });
    }
};
