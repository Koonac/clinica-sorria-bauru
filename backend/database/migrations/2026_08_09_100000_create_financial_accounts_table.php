<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Plano de contas: árvore de categorias de receita/despesa.
     */
    public function up(): void
    {
        Schema::create('financial_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name', 190);
            $table->string('type', 12)->index();
            $table->foreignId('parent_id')->nullable()->constrained('financial_accounts')->nullOnDelete();
            $table->integer('position')->default(0);
            $table->boolean('active')->default(true);
            $table->timestampsTz();

            $table->index(['type', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_accounts');
    }
};
