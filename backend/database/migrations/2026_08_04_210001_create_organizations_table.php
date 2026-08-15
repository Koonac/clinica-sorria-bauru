<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name', 190);
            $table->string('website')->nullable();
            $table->string('instagram', 120)->nullable();
            $table->string('industry', 120)->nullable();
            $table->string('city', 120)->nullable();
            $table->text('notes')->nullable();
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organizations');
    }
};
