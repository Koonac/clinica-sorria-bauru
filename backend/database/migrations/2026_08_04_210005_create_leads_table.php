<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->string('title', 190);
            $table->string('status', 30)->default('new')->index();

            // Dados de pessoa vivem no lead até a conversão criar o contato.
            $table->string('name', 190);
            $table->string('email', 190)->nullable();
            $table->string('mobile', 40)->nullable();
            $table->string('whatsapp_jid', 80)->nullable()->index();
            $table->string('instagram', 120)->nullable();
            $table->string('organization_name', 190)->nullable();

            $table->foreignId('stage_id')->nullable()->constrained('pipeline_stages')->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('source_id')->nullable()->constrained()->nullOnDelete();

            $table->string('external_id', 120)->nullable()->index();
            $table->string('lost_reason', 190)->nullable();

            // FK adicionada na migration de deals (tabela ainda não existe aqui).
            $table->unsignedBigInteger('converted_deal_id')->nullable();
            $table->timestampTz('converted_at')->nullable();

            $table->timestampsTz();

            $table->index(['stage_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leads');
    }
};
