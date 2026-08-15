<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lançamentos financeiros: contas a pagar e a receber na mesma tabela,
     * separadas pela coluna `direction`.
     *
     * "Vencido" não é persistido — é derivado de (status = pending && due_date < hoje).
     */
    public function up(): void
    {
        Schema::create('financial_entries', function (Blueprint $table) {
            $table->id();
            $table->string('direction', 12)->index();
            $table->string('description', 190);
            $table->decimal('amount', 14, 2);
            $table->date('due_date')->index();
            $table->string('status', 12)->default('pending');
            $table->timestampTz('paid_at')->nullable();
            $table->decimal('paid_amount', 14, 2)->nullable();
            $table->string('payment_method', 30)->nullable();
            $table->string('document', 60)->nullable();
            $table->string('party_name', 190)->nullable();
            $table->text('notes')->nullable();

            $table->foreignId('account_id')->nullable()->constrained('financial_accounts')->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('deal_id')->nullable()->constrained()->nullOnDelete();

            $table->uuid('installment_group')->nullable()->index();
            $table->smallInteger('installment_number')->nullable();
            $table->smallInteger('installment_total')->nullable();

            $table->timestampsTz();

            $table->index(['direction', 'status', 'due_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_entries');
    }
};
