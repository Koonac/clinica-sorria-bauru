<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clinics', function (Blueprint $table) {
            // {"1": {"start": "08:00", "end": "18:00"}, ...} — chave = dia ISO (1 = segunda … 7 = domingo).
            // Null = padrão antigo: segunda a sexta no expediente google_calendar_business_*.
            $table->json('business_hours')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('clinics', function (Blueprint $table) {
            $table->dropColumn('business_hours');
        });
    }
};
