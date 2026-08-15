<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->decimal('value', 12, 2)->nullable()->after('source_id');
            $table->char('currency', 3)->default('BRL')->after('value');
        });

        DB::table('sources')->updateOrInsert(
            ['slug' => 'cold_call'],
            [
                'name' => 'Cold call',
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropColumn(['value', 'currency']);
        });

        DB::table('sources')->where('slug', 'cold_call')->delete();
    }
};
