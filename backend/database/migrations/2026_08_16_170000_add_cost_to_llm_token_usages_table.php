<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('llm_token_usages', function (Blueprint $table) {
            $table->decimal('cost', 16, 8)->default(0)->after('total_tokens');
        });
    }

    public function down(): void
    {
        Schema::table('llm_token_usages', function (Blueprint $table) {
            $table->dropColumn('cost');
        });
    }
};
