<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinic_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->string('name', 190);
            $table->text('description')->nullable();
            $table->string('image_path', 255)->nullable();
            $table->decimal('price', 12, 2);
            $table->string('category', 30);
            $table->string('audience', 20);
            $table->json('sizes')->nullable();
            $table->string('colors', 255)->nullable();
            $table->boolean('active')->default(true);
            $table->timestampsTz();

            $table->index(['clinic_id', 'category']);
            $table->index(['clinic_id', 'audience']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinic_products');
    }
};
