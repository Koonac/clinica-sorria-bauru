<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deals', function (Blueprint $table) {
            $table->id();
            $table->string('title', 190);

            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('contact_id')->constrained()->restrictOnDelete();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('source_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('stage_id')->constrained('pipeline_stages')->restrictOnDelete();

            $table->decimal('value', 12, 2)->nullable();
            $table->char('currency', 3)->default('BRL');
            $table->smallInteger('probability')->nullable();
            $table->date('expected_close_on')->nullable();
            $table->timestampTz('closed_at')->nullable();
            $table->string('next_step')->nullable();
            $table->string('lost_reason', 190)->nullable();
            $table->text('lost_notes')->nullable();

            $table->timestampsTz();

            $table->index(['stage_id', 'updated_at']);
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->foreign('converted_deal_id')->references('id')->on('deals')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropForeign(['converted_deal_id']);
        });
        Schema::dropIfExists('deals');
    }
};
