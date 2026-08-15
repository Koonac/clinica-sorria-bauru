<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinic_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->string('code', 64);
            $table->string('name', 190);
            $table->unsignedInteger('duration_minutes');
            $table->decimal('price_particular_min', 10, 2);
            $table->decimal('price_particular_max', 10, 2);
            $table->boolean('accepts_insurance')->default(false);
            $table->text('description')->nullable();
            $table->timestampsTz();

            $table->unique(['clinic_id', 'code']);
            $table->index(['clinic_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinic_services');
    }
};
