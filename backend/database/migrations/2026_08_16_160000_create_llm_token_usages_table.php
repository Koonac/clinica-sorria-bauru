<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('llm_token_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinic_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider', 40)->default('openrouter');
            $table->string('purpose', 40);
            $table->string('model', 120)->nullable();
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('completion_tokens')->default(0);
            $table->unsignedInteger('total_tokens')->default(0);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['created_at']);
            $table->index(['purpose', 'created_at']);
            $table->index(['clinic_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('llm_token_usages');
    }
};
