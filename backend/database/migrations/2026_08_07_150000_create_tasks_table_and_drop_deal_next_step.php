<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('title', 190);
            $table->text('description')->nullable();
            $table->timestampTz('due_at');
            $table->timestampTz('done_at')->nullable();

            $table->foreignId('lead_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('deal_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->timestampsTz();

            $table->index(['lead_id', 'due_at']);
            $table->index(['deal_id', 'due_at']);
            $table->index('done_at');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement(
                'ALTER TABLE tasks ADD CONSTRAINT tasks_entity_xor_check CHECK (
                    (lead_id IS NOT NULL AND deal_id IS NULL)
                    OR (lead_id IS NULL AND deal_id IS NOT NULL)
                )'
            );
        }

        Schema::table('deals', function (Blueprint $table) {
            $table->dropColumn('next_step');
        });
    }

    public function down(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->string('next_step')->nullable()->after('closed_at');
        });

        Schema::dropIfExists('tasks');
    }
};
