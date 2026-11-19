package com.example.textinput;

import android.os.Bundle;
import android.view.View;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private TextInputLayout inputName;
    private TextInputLayout inputEmail;
    private TextInputEditText editName;
    private TextView status;
    private TextView filler;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        inputName = findViewById(R.id.input_name);
        inputEmail = findViewById(R.id.input_email);
        editName = findViewById(R.id.edit_name);
        status = findViewById(R.id.status);
        filler = findViewById(R.id.filler);

        // 填充足够长的占位内容，让页面超出屏幕，制造可滚动区域
        List<String> lines = new ArrayList<String>();
        for (int i = 1; i <= 40; i++) {
            lines.add("第 " + i + " 行：浮动标签需要页面可滚动才能观察到状态变化");
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            if (i > 0) sb.append('\n');
            sb.append(lines.get(i));
        }
        filler.setText(sb.toString());

        // 输入内容后切换浮动标签状态（hint 上浮 / 回落由 TextInputLayout 自己处理）
        editName.addTextChangedListener(new android.text.TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}

            @Override
            public void afterTextChanged(android.text.Editable s) {
                boolean filled = s != null && s.length() > 0;
                status.setText(filled ? R.string.label_filled : R.string.label_empty);
                inputName.setError(filled && s.length() < 2 ? "太短" : null);
            }
        });
    }
}
