<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinics', function (Blueprint $table) {
            $table->id();
            $table->string('name', 190);
            $table->string('slug', 80)->unique();
            $table->boolean('is_active')->default(true);
            $table->text('google_calendar_refresh_token')->nullable();
            $table->string('google_calendar_id', 255)->nullable();
            $table->string('google_calendar_timezone', 64)->nullable();
            $table->unsignedTinyInteger('google_calendar_business_start')->nullable();
            $table->unsignedTinyInteger('google_calendar_business_end')->nullable();
            $table->unsignedTinyInteger('google_calendar_slot_minutes')->nullable();
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinics');
    }
};
