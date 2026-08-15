<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pipeline_stages', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 20); // lead | deal
            $table->string('slug', 60);
            $table->string('name', 120);
            $table->char('color', 7)->default('#6b7280');
            $table->integer('position')->default(0);
            $table->boolean('is_open')->default(true);
            $table->boolean('is_in_progress')->default(false);
            $table->boolean('is_won')->default(false);
            $table->boolean('is_lost')->default(false);
            $table->boolean('active')->default(true);
            $table->timestampsTz();

            $table->unique(['kind', 'slug']);
            $table->index(['kind', 'active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pipeline_stages');
    }
};
