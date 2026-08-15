<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activities', function (Blueprint $table) {
            $table->id();
            $table->string('type', 30)->index();
            $table->string('subject', 190)->nullable();
            $table->text('body')->nullable();
            $table->timestampTz('due_at')->nullable();
            $table->timestampTz('done_at')->nullable();

            $table->foreignId('lead_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('deal_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->jsonb('meta')->nullable();
            $table->timestampsTz();
        });

        // Toda activity precisa apontar para pelo menos uma entidade.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement(
                'ALTER TABLE activities ADD CONSTRAINT activities_entity_check CHECK (lead_id IS NOT NULL OR deal_id IS NOT NULL OR contact_id IS NOT NULL)'
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('activities');
    }
};
