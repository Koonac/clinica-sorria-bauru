<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinic_properties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->string('title', 190)->nullable();
            $table->string('image_path', 255)->nullable();
            $table->string('address', 255);
            $table->decimal('price', 12, 2);
            $table->string('deal_type', 20);
            $table->string('property_type', 30);
            $table->boolean('active')->default(true);
            $table->timestampsTz();

            $table->index(['clinic_id', 'deal_type']);
            $table->index(['clinic_id', 'property_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinic_properties');
    }
};
