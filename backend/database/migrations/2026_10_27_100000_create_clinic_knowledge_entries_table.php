<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinic_knowledge_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->constrained('clinics')->cascadeOnDelete();
            $table->string('category', 30); // horarios | endereco | convenios | pagamento | procedimentos | outros
            $table->string('title', 190)->nullable();
            $table->text('content');
            $table->unsignedInteger('position')->default(0);
            $table->boolean('active')->default(true);
            $table->timestampsTz();

            $table->index(['clinic_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinic_knowledge_entries');
    }
};
