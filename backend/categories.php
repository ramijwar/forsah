<?php
declare(strict_types=1);
function categorySchema(PDO $pdo): void {
    $pdo->exec(<<<'SQL'
CREATE INDEX IF NOT EXISTS ads_category_status ON ads(category,status);
CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, name_en TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'Gavel', color TEXT NOT NULL DEFAULT '#47705c',
 tint TEXT NOT NULL DEFAULT '#edf3e6', subcategories TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);
SQL);
    if($pdo->query("SELECT value FROM app_state WHERE key='categories_initialized'")->fetchColumn())return;
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        if(!$pdo->query("SELECT value FROM app_state WHERE key='categories_initialized'")->fetchColumn()) {
            $seeds=json_decode(file_get_contents(__DIR__.'/default-categories.json'),true,512,JSON_THROW_ON_ERROR);
            $q=$pdo->prepare('INSERT OR IGNORE INTO categories(name,name_en,description,icon,color,tint,subcategories,sort_order) VALUES(?,?,?,?,?,?,?,?)');
            foreach($seeds as $s)$q->execute([$s['name'],$s['name_en'],$s['description'],$s['icon'],$s['color'],$s['tint'],json_encode($s['subcategories'],JSON_UNESCAPED_UNICODE),$s['sort_order']]);
            // Retain existing listing classifications, instead of orphaning legacy ads.
            $pdo->exec("INSERT OR IGNORE INTO categories(name) SELECT DISTINCT category FROM ads WHERE trim(category)<>''");
            $pdo->exec("INSERT INTO app_state(key,value) VALUES('categories_initialized','1')");
        }
        $pdo->exec('COMMIT');
    }catch(Throwable $e){$pdo->exec('ROLLBACK');throw $e;}
}
function categoriesData(PDO $pdo,bool $all=false): array {
    $visibility=$all?'':" AND a.status='active' AND (u.is_banned IS NULL OR u.is_banned=0)";
    $rows=$pdo->query("SELECT c.*,(SELECT COUNT(*) FROM ads a LEFT JOIN users u ON u.id=a.user_id WHERE a.category=c.name$visibility) AS ad_count FROM categories c ".($all?'':'WHERE c.is_active=1 ').'ORDER BY c.sort_order,c.id')->fetchAll();
    foreach($rows as &$r){$r['id']=(int)$r['id'];$r['title']=$r['name'];$r['sort_order']=(int)$r['sort_order'];$r['is_active']=(bool)$r['is_active'];$r['ad_count']=(int)$r['ad_count'];$r['subcategories']=json_decode($r['subcategories'],true);}unset($r);return $rows;
}
function validCategory(PDO $pdo,string $name,?string $previous=null): void {
    if($name===$previous)return;
    $q=$pdo->prepare('SELECT id FROM categories WHERE name=? AND is_active=1');$q->execute([$name]);
    if(!$q->fetchColumn())fail(422,'القسم غير متاح. حدّث قائمة الأقسام واختر قسمًا نشطًا.');
}
function categoryAdmin(PDO $pdo,array $user,string $action,string $method): void {
    if(!in_array($action,['categories','category'],true))return;
    if($action==='categories'&&$method==='GET')ok(['items'=>categoriesData($pdo,true)]);
    if(!in_array($user['role'],['super_admin','admin'],true))fail(403,'إدارة الأقسام للمدير فقط.');
    if($action!=='category'||!in_array($method,['POST','PATCH','DELETE'],true))fail(404,'Unknown category action');
    $body=jsonBody();$id=$method==='POST'?0:positiveId();
    // Serialize rename/delete with each other; updates and reassignment are atomic.
    $pdo->beginTransaction();
    $old=null;
    if($id){$q=$pdo->prepare('SELECT * FROM categories WHERE id=?');$q->execute([$id]);$old=$q->fetch();if(!$old)fail(404,'القسم غير موجود.');}
    if($method==='DELETE') {
        $q=$pdo->prepare('SELECT COUNT(*) FROM ads WHERE category=?');$q->execute([$old['name']]);$count=(int)$q->fetchColumn();
        if($count){
            $replacement=filter_var($body['replacement_id']??null,FILTER_VALIDATE_INT);
            $q=$pdo->prepare('SELECT name FROM categories WHERE id=? AND id<>? AND is_active=1');$q->execute([$replacement,$id]);$target=$q->fetchColumn();
            if(!$target)fail(409,'اختر قسمًا نشطًا لنقل الإعلانات قبل الحذف.');
            $pdo->prepare('UPDATE ads SET category=?,updated_at=datetime(\'now\') WHERE category=?')->execute([$target,$old['name']]);
        }
        $pdo->prepare('DELETE FROM categories WHERE id=?')->execute([$id]);audit($user,'category.delete','category',$id,['moved_ads'=>$count]);$pdo->commit();ok(['id'=>$id]);
    }
    $name=textField($body,'name',80);$english=textField($body,'name_en',80,false);$description=textField($body,'description',250,false);
    $icon=textField($body,'icon',30);if(!in_array($icon,['Gavel','UsersRound','Truck','Zap','Armchair','PackageCheck','Wrench'],true))fail(422,'أيقونة غير صالحة');
    $color=textField($body,'color',7);$tint=textField($body,'tint',7);
    if(!preg_match('/^#[0-9a-f]{6}$/i',$color)||!preg_match('/^#[0-9a-f]{6}$/i',$tint))fail(422,'لون غير صالح');
    $subs=$body['subcategories']??[];if(!is_array($subs)||!array_is_list($subs)||count($subs)>12)fail(422,'حتى 12 خيارًا فرعيًا');
    foreach($subs as $sub)if(!is_string($sub)||trim($sub)===''||mb_strlen($sub)>60)fail(422,'خيار فرعي غير صالح');
    $subs=array_values(array_unique(array_map('trim',$subs)));$sort=filter_var($body['sort_order']??0,FILTER_VALIDATE_INT);
    if($sort===false||$sort<0||$sort>9999||!is_bool($body['is_active']??null))fail(422,'ترتيب أو حالة غير صالحة');
    $duplicate=$pdo->prepare('SELECT id FROM categories WHERE name=? AND id<>?');$duplicate->execute([$name,$id]);if($duplicate->fetchColumn())fail(409,'يوجد قسم بهذا الاسم بالفعل.');
    $args=[$name,$english,$description,$icon,$color,$tint,json_encode($subs,JSON_UNESCAPED_UNICODE),$sort,$body['is_active']?1:0];
    if($id){$args[]=$id;$pdo->prepare('UPDATE categories SET name=?,name_en=?,description=?,icon=?,color=?,tint=?,subcategories=?,sort_order=?,is_active=? WHERE id=?')->execute($args);
        $pdo->prepare('UPDATE ads SET category=?,updated_at=datetime(\'now\') WHERE category=?')->execute([$name,$old['name']]);
    }else{$pdo->prepare('INSERT INTO categories(name,name_en,description,icon,color,tint,subcategories,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,?)')->execute($args);$id=(int)$pdo->lastInsertId();}
    audit($user,$method==='POST'?'category.create':'category.update','category',$id);$pdo->commit();ok(['id'=>$id],$method==='POST'?201:200);
}
