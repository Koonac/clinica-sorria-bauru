<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agents', function (Blueprint $table) {
            // {"1": {"start": "18:00", "end": "08:00"}, ...} — chave = dia ISO (1 = segunda … 7 = domingo).
            // Null = atende 24 horas.
            $table->json('working_hours')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agents', function (Blueprint $table) {
            $table->dropColumn('working_hours');
        });
    }
};
